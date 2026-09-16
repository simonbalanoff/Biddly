import JoinClient from "./join-client";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <JoinClient token={params.token ?? ""} />;
}
