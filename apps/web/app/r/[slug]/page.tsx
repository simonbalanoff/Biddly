import PublicFormClient from "./public-form-client";

export default async function PublicRecruitmentFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicFormClient slug={slug} />;
}
