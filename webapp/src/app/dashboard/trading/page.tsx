import { redirect } from "next/navigation";

/**
 * The old path - trading monitoring moved to /admin/trading/monitor. (#53)
 *
 * It moved when the tree, split from the settings (/admin/trading), was merged. Only a redirect remains so
 * bookmarks and existing links keep working. The permission check belongs to the destination page.
 */
export default function LegacyTradingMonitorRedirect() {
    redirect("/admin/trading/monitor");
}
