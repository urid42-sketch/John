import { he } from '../i18n/he';
import { Page } from '../ui/Page';

export function HelpScreen() {
  return (
    <Page title={he.guide.title}>
      <div className="space-y-4 p-4">
        {he.guide.sections.map((s) => (
          <section key={s.h} className="rounded-3xl border border-line bg-paper p-5">
            <h2 className="mb-3 font-serif text-lg">{s.h}</h2>
            <ol className="space-y-2.5">
              {s.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-soft text-xs font-medium text-rose-deep">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Page>
  );
}
