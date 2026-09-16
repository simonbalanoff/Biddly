import SetupClient from "./setup-client";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <SetupClient token={params.token ?? ""} />;
}
