import Image from "next/image";
import Calendar from "../components/Calendar";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-16 px-8 bg-white dark:bg-black sm:items-start">
        <div className="w-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Image
                className="dark:invert"
                src="/next.svg"
                alt="Next.js logo"
                width={80}
                height={18}
                priority
              />
              <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">My Calendar</h1>
            </div>
          </div>

          <div>
            <Calendar />
          </div>
        </div>
      </main>
    </div>
  );
}
