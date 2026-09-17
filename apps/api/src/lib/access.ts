export type ChapterAccessReason = "CHAPTER_SUSPENDED" | "ORGANIZATION_SUSPENDED" | "UNIVERSITY_SUSPENDED" | null;

export function chapterAccessReason(input: { chapterActive: boolean; organizationActive: boolean; universityActive: boolean }): ChapterAccessReason {
  if (!input.organizationActive) return "ORGANIZATION_SUSPENDED";
  if (!input.universityActive) return "UNIVERSITY_SUSPENDED";
  if (!input.chapterActive) return "CHAPTER_SUSPENDED";
  return null;
}

export function chapterAccessMessage(reason: ChapterAccessReason) {
  if (reason === "ORGANIZATION_SUSPENDED") return "This organization is currently suspended";
  if (reason === "UNIVERSITY_SUSPENDED") return "This university is currently suspended";
  if (reason === "CHAPTER_SUSPENDED") return "This chapter workspace is currently suspended";
  return "Chapter access is unavailable";
}
