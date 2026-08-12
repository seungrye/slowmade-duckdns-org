import Link from "next/link";

/**
 * 로그인해야 볼 수 있는 화면의 안내 (#109).
 *
 * 리다이렉트 대신 안내를 띄운다 — 무엇을 위해 로그인하는지 보이는 편이 낫고, 뒤로 가기로
 * 튕겨 나오는 일도 없다.
 */
export default function LoginRequired({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-600 dark:text-gray-300">{what}은(는) 로그인 후 이용할 수 있습니다.</p>
      <Link
        href="/login"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
      >
        로그인하기
      </Link>
    </div>
  );
}
