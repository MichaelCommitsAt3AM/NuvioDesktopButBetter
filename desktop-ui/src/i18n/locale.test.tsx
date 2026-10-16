import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { applyDocumentLocale, useLocale } from './strings';

afterEach(() => {
  cleanup();
  applyDocumentLocale('en');
});

const bridge = vi.hoisted(() => ({ language: 'device' }));
vi.mock('../bridge', () => ({
  useFeatureSnapshot: () => ({ language: bridge.language, languages: [{ code: 'device', label: 'Device' }, { code: 'es', label: 'Español' }] }),
}));

function Probe() {
  const { code, t } = useLocale();
  return <p>{code}:{t('action_cancel')}</p>;
}

describe('useLocale rendering', () => {
  it('changes the interface when the saved language changes', async () => {
    bridge.language = 'device';
    const view = render(<Probe />);
    await waitFor(() => expect(screen.getByText(/en:Cancel/)).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    bridge.language = 'es';
    view.rerender(<Probe />);
    await waitFor(() => expect(screen.getByText(/es:Cancelar/)).toBeInTheDocument());
    expect(document.documentElement.lang).toBe('es');
  });

  it('applies right-to-left layout for supported locales', () => {
    applyDocumentLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
