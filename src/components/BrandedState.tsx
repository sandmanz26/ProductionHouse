import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import { GrainRings } from "@/brand/Logo";

/** Full-page dead end (404, crash): the brand's serif voice over faint end-grain rings. */
export function BrandedState({ code, title, body }: { code: string; title: string; body: string }) {
  const navigate = useNavigate();
  return (
    <div className="relative isolate mx-auto max-w-md overflow-hidden px-2 py-20 text-center">
      <GrainRings className="pointer-events-none absolute top-1/2 left-1/2 -z-10 w-[560px] max-w-none -translate-x-1/2 -translate-y-1/2 text-[var(--rule)]" />
      <p className="num text-sm text-muted">{code}</p>
      <h1 className="title-display mt-2 text-[28px] leading-tight">{title}</h1>
      <p className="mt-3 text-sm break-words text-muted">{body}</p>
      <Button className="mt-6" onPress={() => navigate("/")}>
        Back to home
      </Button>
    </div>
  );
}
