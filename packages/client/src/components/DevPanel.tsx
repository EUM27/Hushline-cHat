import type { ClientSessionState } from "@hushline/shared";
import type { VisualThemePreset } from "../types/ui";
import { createVisualThemeStyle } from "../utils/ui-helpers";

export function DevPanel({
  session,
  open,
  theme,
}: {
  session: ClientSessionState;
  open: boolean;
  theme: VisualThemePreset;
}) {
  // v2 세션이면 worldState/handouts가 있음
  const worldState = (session as any).worldState;
  const handouts = (session as any).handouts;
  const scene = session.scene;

  return (
    <aside
      className={`dev-panel ${open ? "open" : ""}`}
      style={createVisualThemeStyle(theme)}
      aria-hidden={!open}
    >
      {open && (
        <div className="dev-panel-content">
          <h3>Dev Panel</h3>

          <section className="dev-section">
            <h4>World State</h4>
            <div className="dev-grid">
              <span>Tension</span><strong>{worldState?.tension ?? scene?.tension ?? "?"}</strong>
              <span>Danger</span><strong>{worldState?.danger ?? scene?.danger ?? "?"}</strong>
              <span>Turn</span><strong>{worldState?.turnNumber ?? scene?.turnNumber ?? "?"}</strong>
              <span>Location</span><strong>{worldState?.locationId ?? scene?.locationId ?? "?"}</strong>
              <span>Scene Mode</span><strong>{worldState?.sceneMode ?? "?"}</strong>
            </div>
          </section>

          {worldState?.mainObjective && (
            <section className="dev-section">
              <h4>Main Objective</h4>
              <p className="dev-objective">{worldState.mainObjective.description} [{worldState.mainObjective.status}]</p>
            </section>
          )}

          {worldState?.subObjectives?.length > 0 && (
            <section className="dev-section">
              <h4>Sub-Objectives</h4>
              {worldState.subObjectives.map((obj: any) => (
                <p key={obj.id} className="dev-sub-obj">
                  <span className={`dev-status ${obj.status}`}>{obj.status}</span> {obj.description}
                </p>
              ))}
            </section>
          )}

          {handouts && (
            <section className="dev-section">
              <h4>Handouts</h4>
              {Object.entries(handouts).map(([charId, handout]: [string, any]) => (
                <details key={charId} className="dev-handout">
                  <summary>{charId}</summary>
                  <div className="dev-handout-content">
                    <p><strong>비밀:</strong> {handout.secret}</p>
                    <p><strong>욕망:</strong> {handout.desire}</p>
                    <p><strong>목표:</strong> {handout.objective}</p>
                    <p><strong>유저 관계:</strong> {handout.relationshipToUser}</p>
                    <p><strong>Autonomy:</strong> {handout.autonomy}</p>
                    {handout.knownFacts?.length > 0 && (
                      <p><strong>알고 있는 사실:</strong> {handout.knownFacts.join(", ")}</p>
                    )}
                  </div>
                </details>
              ))}
            </section>
          )}

          {worldState?.relationshipGraph?.length > 0 && (
            <section className="dev-section">
              <h4>Relationship Graph</h4>
              {worldState.relationshipGraph.map((edge: any, i: number) => (
                <p key={i} className="dev-edge">
                  {edge.sourceId} → {edge.targetId}: <strong>{edge.descriptor}</strong> ({edge.intensity}/10)
                </p>
              ))}
            </section>
          )}

          {worldState?.characterStates && (
            <section className="dev-section">
              <h4>Character States</h4>
              {Object.entries(worldState.characterStates).map(([id, state]: [string, any]) => (
                <div key={id} className="dev-char-state">
                  <strong>{id}</strong>
                  <span>목표: {state.currentObjective}</span>
                  <span>유저관계: {state.relationshipToUser}</span>
                  <span>마지막 발화: T{state.lastSpokeTurn}</span>
                  <span>Autonomy: {state.autonomy}</span>
                </div>
              ))}
            </section>
          )}

          {worldState?.recentEvents?.length > 0 && (
            <section className="dev-section">
              <h4>Recent Events</h4>
              {worldState.recentEvents.slice(-5).map((evt: any) => (
                <p key={evt.id} className="dev-event">T{evt.turnNumber}: {evt.description}</p>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
