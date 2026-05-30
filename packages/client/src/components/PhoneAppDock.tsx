import { MessageCircle, NotebookPen } from "lucide-react";
import type { PhoneAppId } from "../utils/phone-apps";

const APP_META: Record<PhoneAppId, { label: string; Icon: typeof MessageCircle }> = {
  casefile: { label: "사건파일", Icon: NotebookPen },
  messenger: { label: "메신저", Icon: MessageCircle },
};

export function PhoneAppDock({
  available,
  activeApp,
  unread,
  onSelect,
}: {
  available: PhoneAppId[];
  activeApp: PhoneAppId;
  unread: Record<PhoneAppId, boolean>;
  onSelect: (app: PhoneAppId) => void;
}) {
  return (
    <nav className="phone-app-dock" aria-label="휴대폰 앱">
      {available.map((app) => {
        const { label, Icon } = APP_META[app];
        return (
          <button
            key={app}
            type="button"
            className={`phone-app-dock-btn ${activeApp === app ? "active" : ""}`}
            aria-label={label}
            aria-current={activeApp === app}
            onClick={() => onSelect(app)}
          >
            <span className="phone-app-dock-icon">
              <Icon size={18} aria-hidden="true" />
              {unread[app] && activeApp !== app ? (
                <span className="phone-app-dock-badge" aria-label="새 항목" />
              ) : null}
            </span>
            <span className="phone-app-dock-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
