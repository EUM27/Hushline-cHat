import type { StateLawSnapshot } from "@hushline/shared";

export function buildDirectorLawSections(stateLaw: StateLawSnapshot) {
  return [
    { title: "고정 사실", items: stateLaw.immutableFacts },
    { title: "느린 상태", items: stateLaw.slowState },
    { title: "장면 압력", items: stateLaw.scenePressure },
    { title: "출력 규칙", items: stateLaw.outputRules },
  ];
}

export function DirectorLawPanel({ stateLaw }: { stateLaw: StateLawSnapshot | null | undefined }) {
  if (!stateLaw) {
    return (
      <aside className="director-law-panel" aria-label="Director Law">
        <section>
          <h2>Director Law</h2>
          <p>아직 생성된 상태 법칙이 없습니다.</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="director-law-panel" aria-label="Director Law">
      {buildDirectorLawSections(stateLaw).map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
