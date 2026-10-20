'use client';

import { useI18n } from '@/contexts/i18n-context';
import { Lang, LANG_LABELS } from '@/lib/i18n';
import { toast } from 'sonner';

export default function IdiomaPage() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      <h1 className="text-2xl font-bold">{t('settings.language')}</h1>
      <p className="text-sm text-muted-foreground">{t('account.language_hint')}</p>
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(LANG_LABELS) as Lang[]).map((L) => (
          <button
            key={L}
            type="button"
            onClick={async () => {
              await setLang(L);
              toast.success(LANG_LABELS[L]);
            }}
            className={`rounded-xl border px-4 py-3 text-left ${
              lang === L ? 'border-primary bg-primary/10' : 'border-border bg-card'
            }`}
          >
            <div className="font-medium">{LANG_LABELS[L]}</div>
            <div className="text-xs text-muted-foreground">{L.toUpperCase()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
