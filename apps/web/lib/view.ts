import "server-only";
import { cookies } from "next/headers";

export type View = "simple" | "developer";
export const VIEW_COOKIE = "pci_view";

/** Simple (plain language) is the default; Developer shows the technical detail. */
export async function currentView(): Promise<View> {
  return (await cookies()).get(VIEW_COOKIE)?.value === "developer" ? "developer" : "simple";
}
