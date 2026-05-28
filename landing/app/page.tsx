import { redirect } from "next/navigation";
import { MarketingHomePage } from "../components/marketing-home-page";

const configuredAppShellUrl = process.env.NEXT_PUBLIC_CREWTOOLS_APP_URL?.trim();

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const landingRequested = resolvedSearchParams.landing === "1";

  if (landingRequested) {
    return <MarketingHomePage />;
  }

  if (configuredAppShellUrl) {
    redirect(configuredAppShellUrl);
  }

  redirect("/landing");
}
