import Image from "next/image";
import { MASCOT_URL } from "@/lib/brand";

export function Mascot({ size = 160, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <div
      className="clay grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Image src={MASCOT_URL} alt="" width={size} height={size} priority={priority} className="size-full object-cover" />
    </div>
  );
}
