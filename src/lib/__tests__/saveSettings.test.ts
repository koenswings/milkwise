jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));

import { saveSettings, SettingsSaveError, saveErrorMessage } from '../store';
import { Settings } from '../../types';

const settings: Settings = {
  weightKg: 6.5, mlPerKgPerDay: 150, preferredBottleWaterMl: 120,
  yellowThresholdPct: 5, redThresholdPct: 10, timeFormat: '24h',
};
const fetchMock = jest.fn();
beforeEach(() => { fetchMock.mockReset(); (global as unknown as { fetch: jest.Mock }).fetch = fetchMock; });

describe('saveSettings (phase 1b: failed saves surface)', () => {
  it('resolves on a 2xx response and identifies itself as mobile', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(saveSettings(settings)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/settings$/);
    expect(init.method).toBe('POST');
    expect(init.headers['X-MilkWise-Source']).toBe('mobile');
    expect(JSON.parse(init.body)).toEqual(settings);
  });

  it('throws SettingsSaveError(http) on an HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const err = await saveSettings(settings).catch((e) => e);
    expect(err).toBeInstanceOf(SettingsSaveError);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
    expect(saveErrorMessage(err)).toMatch(/not saved.*HTTP 500/);
  });

  it('throws SettingsSaveError(network) when the request fails (offline)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const err = await saveSettings(settings).catch((e) => e);
    expect(err).toBeInstanceOf(SettingsSaveError);
    expect(err.kind).toBe('network');
    expect(saveErrorMessage(err)).toMatch(/not saved.*could not reach the server.*Network request failed/);
  });

  it('formats unknown errors too', () => {
    expect(saveErrorMessage(new Error('boom'))).toBe('Settings not saved: boom');
  });
});
