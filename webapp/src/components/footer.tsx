export default function Footer() {
    return (
        <footer className="bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 py-8">
            <div className="mx-auto px-4">
                <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-4 text-sm text-center text-gray-500 dark:text-gray-400 space-y-1">
                    <div>
                        &copy; {new Date().getFullYear()} Handmade Site. All rights reserved.
                    </div>
                    <div className="text-xs">
                        아이콘 폰트:{" "}
                        <a
                            href="https://game-icons.net"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-gray-700 dark:hover:text-gray-200"
                        >
                            game-icons.net
                        </a>
                        {" "}(CC BY 3.0)
                    </div>
                </div>
            </div>
        </footer>
    );
}
