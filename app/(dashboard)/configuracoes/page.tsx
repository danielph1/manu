'use client';
import Link from 'next/link';
import {
  User, Heart, Palette, Info, Shield, ChevronRight, Bell, Languages,
  HelpCircle, FileText, Volume2, MonitorSmartphone, Lock,
} from 'lucide-react';
import { useI18n } from '@/contexts/i18n-context';
import { Lang, LANG_LABELS } from '@/lib/i18n';
import { toast } from 'sonner';

const Item = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => (
  <Link
    href={href}
    className="flex items-center justify-between border-b border-border px-4 py-4 text-sm last:border-0"
  >
    <span className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {label}
    </span>
    <ChevronRight className="h-4 w-4 text-muted-foreground" />
  </Link>
);

export default function ConfiguracoesPage() {
  const { t, lang, setLang } = useI18n();

  async function changeLang(l: Lang) {
    await setLang(l);
    toast.success(LANG_LABELS[l]);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">{t('settings.personal')}</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Item href="/minha-conta" icon={User} label={t('settings.my_account')} />
          <Item href="/favoritos" icon={Heart} label={t('settings.favorites')} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">{t('settings.prefs')}</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Item href="/temas" icon={Palette} label={t('settings.theme')} />
          <Item href="/configuracoes/notificacoes" icon={Bell} label={t('settings.notifications')} />
          <div className="border-b border-border px-4 py-3 last:border-0">
            <div className="mb-2 flex items-center gap-3 text-sm">
              <Languages className="h-5 w-5 text-muted-foreground" />
              {t('settings.language')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(LANG_LABELS) as Lang[]).map((L) => (
                <button
                  key={L}
                  type="button"
                  onClick={() => changeLang(L)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    lang === L ? 'border-primary bg-primary/10 font-medium' : 'border-border'
                  }`}
                >
                  {LANG_LABELS[L]}
                </button>
              ))}
            </div>
          </div>
          <Item href="/configuracoes/notificacoes" icon={Volume2} label={t('settings.sound')} />
          <Item href="/minha-conta" icon={MonitorSmartphone} label={t('settings.devices')} />
          <Item href="/configuracoes/notificacoes" icon={Lock} label={t('settings.privacy_mode')} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">{t('settings.institutional')}</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Item href="/sobre" icon={Info} label={t('settings.about')} />
          <Item href="/privacidade" icon={Shield} label={t('settings.privacy')} />
          <Item href="/privacidade" icon={FileText} label={t('settings.terms')} />
          <Item href="/sobre" icon={HelpCircle} label={t('settings.help')} />
        </div>
      </section>
    </div>
  );
}
