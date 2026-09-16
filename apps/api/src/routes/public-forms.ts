import { randomUUID } from "node:crypto";
import { publicFormSubmissionSchema } from "@biddly/contracts";
import { Prisma, prisma } from "@biddly/db";
import { FastifyInstance } from "fastify";
import { validateCustomFieldValues } from "../lib/custom-fields.js";
import { normalizePhone } from "../lib/phone.js";
import { createPrivateUploadUrl, storageConfigured } from "../lib/storage.js";

function extensionForContentType(contentType: string) {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
}

function fieldDescriptor(key: string, label: string, type: string, mode: string) {
  return {
    key,
    label,
    type,
    visible: mode !== "HIDDEN",
    required: mode === "REQUIRED"
  };
}

export async function publicFormRoutes(app: FastifyInstance) {
  app.get("/public/forms/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const form = await prisma.publicRecruitmentForm.findUnique({
      where: { slug },
      include: {
        recruitmentCycle: {
          include: {
            fieldDefinitions: {
              where: { visibleOnPublicForm: true },
              orderBy: { position: "asc" }
            },
            chapter: {
              include: {
                organization: true,
                university: true,
                branding: true
              }
            }
          }
        }
      }
    });

    if (!form) {
      return reply.code(404).send({ error: "Form not found" });
    }

    const chapter = form.recruitmentCycle.chapter;
    const organization = chapter.organization;
    const branding = chapter.branding;

    return {
      slug: form.slug,
      isOpen: form.isOpen && form.recruitmentCycle.status === "ACTIVE",
      title: form.title,
      introText: form.introText,
      organization: {
        name: organization.name,
        shortName: organization.shortName
      },
      chapter: {
        name: chapter.name,
        universityName: chapter.university.name,
        universityShortName: chapter.university.shortName
      },
      branding: {
        primaryColor: branding?.primaryColor ?? organization.primaryColor,
        secondaryColor: branding?.secondaryColor ?? organization.secondaryColor,
        accentColor: branding?.accentColor ?? organization.accentColor,
        logoUrl: branding?.logoUrl ?? organization.logoUrl,
        crestUrl: branding?.crestUrl ?? organization.crestUrl
      },
      coreFields: [
        { key: "firstName", label: "First Name", type: "SHORT_TEXT", visible: true, required: true },
        { key: "lastName", label: "Last Name", type: "SHORT_TEXT", visible: true, required: true },
        fieldDescriptor("email", "Email", "EMAIL", form.emailMode),
        fieldDescriptor("phone", "Phone", "PHONE", form.phoneMode),
        fieldDescriptor("photo", "Photo", "PHOTO", form.photoMode)
      ].filter((field) => field.visible),
      customFields: form.recruitmentCycle.fieldDefinitions.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        validation: field.validation
      }))
    };
  });

  app.post(
    "/public/forms/:slug/submissions",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const parsed = publicFormSubmissionSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid submission" });
      }

      const form = await prisma.publicRecruitmentForm.findUnique({
        where: { slug },
        include: {
          recruitmentCycle: {
            include: {
              statuses: { orderBy: { position: "asc" }, take: 1 },
              fieldDefinitions: true,
              chapter: true
            }
          }
        }
      });

      if (!form || !form.isOpen || form.recruitmentCycle.status !== "ACTIVE") {
        return reply.code(404).send({ error: "Form is not accepting submissions" });
      }

      if (form.emailMode === "REQUIRED" && !parsed.data.email) {
        return reply.code(400).send({ error: "Email is required" });
      }

      if (form.phoneMode === "REQUIRED" && !parsed.data.phone) {
        return reply.code(400).send({ error: "Phone is required" });
      }

      if (form.photoMode === "REQUIRED" && !parsed.data.photo) {
        return reply.code(400).send({ error: "Photo is required" });
      }

      if (form.emailMode === "HIDDEN" && parsed.data.email) {
        return reply.code(400).send({ error: "Email is not accepted by this form" });
      }

      if (form.phoneMode === "HIDDEN" && parsed.data.phone) {
        return reply.code(400).send({ error: "Phone is not accepted by this form" });
      }

      if (form.photoMode === "HIDDEN" && parsed.data.photo) {
        return reply.code(400).send({ error: "Photo is not accepted by this form" });
      }

      if (parsed.data.photo && !storageConfigured()) {
        return reply.code(503).send({ error: "Photo uploads are temporarily unavailable" });
      }

      const validation = validateCustomFieldValues(
        form.recruitmentCycle.fieldDefinitions,
        parsed.data.customFields,
        true,
        true
      );

      if (!validation.ok) {
        return reply.code(400).send({ error: validation.error });
      }

      const firstStatus = form.recruitmentCycle.statuses[0];

      if (!firstStatus) {
        return reply.code(409).send({ error: "Recruitment workflow is not configured" });
      }

      if (parsed.data.email) {
        const duplicate = await prisma.candidate.findFirst({
          where: {
            recruitmentCycleId: form.recruitmentCycleId,
            email: parsed.data.email,
            archivedAt: null
          },
          select: { id: true }
        });

        if (duplicate) {
          return reply.code(409).send({ error: "A submission with this email already exists" });
        }
      }

      const candidate = await prisma.$transaction(async (tx) => {
        const created = await tx.candidate.create({
          data: {
            chapterId: form.recruitmentCycle.chapterId,
            recruitmentCycleId: form.recruitmentCycleId,
            statusId: firstStatus.id,
            statusPosition: firstStatus.position,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            email: form.emailMode === "HIDDEN" ? null : parsed.data.email ?? null,
            phone: form.phoneMode === "HIDDEN" ? null : normalizePhone(parsed.data.phone),
            source: "PUBLIC_FORM",
            aggregate: { create: {} }
          }
        });

        const fieldsByKey = new Map(validation.fields.map((field) => [field.key, field]));

        for (const [key, value] of Object.entries(parsed.data.customFields)) {
          const field = fieldsByKey.get(key);
          const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

          if (!field || empty) {
            continue;
          }

          await tx.candidateFieldValue.create({
            data: {
              candidateId: created.id,
              fieldId: field.id,
              value: value as Prisma.InputJsonValue
            }
          });
        }

        return created;
      });

      let photoUpload: { uploadUrl: string; contentType: string; expiresInSeconds: number } | null = null;

      if (parsed.data.photo) {
        const key = `candidate-photos/${candidate.chapterId}/${candidate.recruitmentCycleId}/${candidate.id}/${randomUUID()}.${extensionForContentType(parsed.data.photo.contentType)}`;
        const uploadUrl = await createPrivateUploadUrl(
          key,
          parsed.data.photo.contentType,
          parsed.data.photo.byteLength
        );

        if (uploadUrl) {
          await prisma.candidate.update({ where: { id: candidate.id }, data: { photoKey: key } });
          photoUpload = {
            uploadUrl,
            contentType: parsed.data.photo.contentType,
            expiresInSeconds: 600
          };
        }
      }

      return reply.code(201).send({
        id: candidate.id,
        confirmationMessage:
          form.confirmationMessage ?? "Thanks for your interest. Your information has been submitted.",
        photoUpload
      });
    }
  );
}
