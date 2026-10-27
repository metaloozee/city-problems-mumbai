import { useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useDesktop } from "@/hooks/use-media";

/** Map space the panel covers, so the map centres places in the visible part. Desktop: 400px card + 16px margin + 16px gap. */
export const PANEL_LEFT = 432;
/** Height of the phone sheet when lowered, including the 56px tab bar it sits behind. */
export const SHEET_PEEK = 296;
const SNAPS: (string | number)[] = [`${SHEET_PEEK}px`, 0.92];

/** Full-bleed map with the view's controls in a floating card (desktop) or a bottom sheet (phone). */
export function MapLayout({ label, panel, map }: { label: string; panel: ReactNode; map: ReactNode }) {
  const desktop = useDesktop();
  const [snap, setSnap] = useState<string | number | null>(SNAPS[0]);
  return (
    <div className="relative h-full">
      {map}
      {desktop ? (
        <aside aria-label={label} className="absolute top-4 left-4 z-20 flex max-h-[calc(100%-2rem)] w-[400px] flex-col overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">{panel}</div>
        </aside>
      ) : (
        <Drawer open modal={false} dismissible={false} snapPoints={SNAPS} activeSnapPoint={snap} setActiveSnapPoint={setSnap}>
          <DrawerContent aria-describedby={undefined} className="h-[92dvh] max-h-none! rounded-t-2xl! bg-card outline-none shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
            <DrawerTitle className="sr-only">{label}</DrawerTitle>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-3 pb-24">{panel}</div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
