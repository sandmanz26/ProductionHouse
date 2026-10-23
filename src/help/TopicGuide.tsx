import { FlowSteps } from "./FlowSteps";
import { termByName, type HelpTopic } from "./content";

/** The body of one module guide, shared by the page panel and the Help page. */
export function TopicGuide({ topic }: { topic: HelpTopic }) {
  return (
    <div className="flex flex-col gap-5 text-[13px] leading-relaxed">
      <p className="text-[14px]">{topic.summary}</p>
      <div>
        <p className="caption-label mb-2">How it flows</p>
        <FlowSteps steps={topic.flow} note={topic.flowNote} compact />
      </div>
      {topic.tasks.map((t) => (
        <div key={t.title}>
          <p className="caption-label mb-1.5">{t.title}</p>
          <ol className="ml-5 list-decimal space-y-1 marker:text-muted">
            {t.steps.map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ol>
        </div>
      ))}
      {topic.effects?.length ? (
        <div>
          <p className="caption-label mb-1.5">What it changes elsewhere</p>
          <ul className="ml-5 list-disc space-y-1 marker:text-muted">
            {topic.effects.map((e, k) => (
              <li key={k}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {topic.terms?.length ? (
        <div>
          <p className="caption-label mb-1.5">Words on this page</p>
          <dl className="space-y-1.5">
            {topic.terms.map((name) => {
              const term = termByName(name);
              return term ? (
                <div key={name}>
                  <dt className="inline font-medium">{term.term}</dt>
                  <dd className="inline text-muted"> — {term.meaning}</dd>
                </div>
              ) : null;
            })}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
