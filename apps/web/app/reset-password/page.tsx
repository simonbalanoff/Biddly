import ResetPasswordClient from "./reset-password-client";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <ResetPasswordClient token={params.token ?? ""} />;
}
