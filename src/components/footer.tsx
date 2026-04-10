export default function Footer() {
    return (
        <footer className="bg-white text-gray-500 py-8">
            <div className="mx-auto px-4">
                <div className="mt-8 border-t border-gray-200 pt-4 text-sm text-center text-gray-500">
                    &copy; {new Date().getFullYear()} Handmade Site. All rights reserved.
                </div>
            </div>
        </footer>
    );
}
