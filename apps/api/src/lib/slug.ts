import { prisma } from "@biddly/db";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createUniqueChapterSlug(base: string) {
  const root = slugify(base) || "chapter";
  let slug = root;
  let index = 2;

  while (await prisma.chapter.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${index}`;
    index += 1;
  }

  return slug;
}
