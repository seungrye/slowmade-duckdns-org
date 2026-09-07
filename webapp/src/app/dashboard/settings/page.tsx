import SettingsFormSection from "./settings-form";

// Personal settings (the theme) only. The trading settings are owner-only and were split out under
// the stocks menu at /admin/trading. (#47)
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    return (
        <main className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-900">설정</h1>
            <SettingsFormSection />
        </main>
    );
}
