import SettingsFormSection from "./settings-form";

// 개인 설정(테마) 전용. 자동매매 설정은 owner 전용이라 주식 메뉴 아래
// /admin/trading 으로 분리했다. (#47)
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    return (
        <main className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-900">설정</h1>
            <SettingsFormSection />
        </main>
    );
}
