import Link from "next/link";

/**
 * The notice for a screen that requires a login (#109).
 *
 * A notice rather than a redirect - it is better to see what one is logging in for, and there is no being bounced
 * back out by the back button.
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
