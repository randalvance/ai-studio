import Link from "next/link";
import { Empty } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex-1 p-6">
      <Empty>
        Not found.{" "}
        <Link href="/image" className="underline">
          Back to the studio
        </Link>
      </Empty>
    </main>
  );
}
