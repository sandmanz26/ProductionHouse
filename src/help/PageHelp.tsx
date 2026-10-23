import { Button, Drawer } from "@heroui/react";
import { CircleHelp, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { topicFor } from "./content";
import { useHelp } from "./help-store";
import { TopicGuide } from "./TopicGuide";

/** Header button + right-hand panel explaining the current page. */
export function PageHelpButton() {
  const { pathname } = useLocation();
  const setPanel = useHelp((s) => s.setPanel);
  if (pathname === "/help") return null;
  return (
    <Button variant="ghost" size="sm" onPress={() => setPanel(true)} aria-label="How this page works">
      <CircleHelp className="size-4" />
      <span className="hidden sm:inline">How this works</span>
    </Button>
  );
}

export function PageHelpPanel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const open = useHelp((s) => s.panelOpen);
  const setPanel = useHelp((s) => s.setPanel);
  const topic = topicFor(pathname);
  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={setPanel}>
      <Drawer.Content placement="right" className="w-[28rem] max-w-[92vw]">
        <Drawer.Dialog aria-label="How this page works">
          <Drawer.Header className="flex items-start justify-between gap-2">
            <div>
              <p className="eyebrow">How this works</p>
              <h2 className="text-base font-semibold">{topic?.title ?? "This page"}</h2>
            </div>
            <Button isIconOnly variant="ghost" size="sm" aria-label="Close" onPress={() => setPanel(false)}>
              <X className="size-4" />
            </Button>
          </Drawer.Header>
          <Drawer.Body className="pb-6">
            {topic ? <TopicGuide topic={topic} /> : <p className="text-[13px] text-muted">There is no guide for this page yet. The Help page explains every module.</p>}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--rule)] pt-4">
              <Button
                variant="tertiary"
                size="sm"
                onPress={() => {
                  setPanel(false);
                  navigate(topic ? `/help#${topic.id}` : "/help");
                }}
              >
                Open the full Help
              </Button>
            </div>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** A one-line hint the first time someone opens a page. */
export function FirstVisitTip() {
  const { pathname } = useLocation();
  const topic = topicFor(pathname);
  const { seenTips, tipsOff, tourDone, dismissTip, setPanel, setTipsOff } = useHelp();
  if (!topic || tipsOff || !tourDone || seenTips.includes(topic.id) || pathname === "/help") return null;
  return (
    <aside aria-label="Tip for this page" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-[var(--rule)] border-l-[3px] border-l-accent bg-surface px-3 py-2 text-[13px]">
      <span className="font-medium">New here?</span>
      <span className="min-w-0 flex-1 text-foreground/80">{topic.summary}</span>
      <span className="flex gap-1">
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => {
            dismissTip(topic.id);
            setPanel(true);
          }}
        >
          Show me how
        </Button>
        <Button size="sm" variant="ghost" onPress={() => dismissTip(topic.id)}>
          Got it
        </Button>
        <Button size="sm" variant="ghost" className="text-muted" onPress={() => setTipsOff(true)}>
          Hide all tips
        </Button>
      </span>
    </aside>
  );
}
