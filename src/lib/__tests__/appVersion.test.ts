import app from '../../../app.json';

test('android.versionCode equals ios.buildNumber', () => {
  expect(app.expo.android.versionCode).toBe(Number(app.expo.ios.buildNumber));
});
test('version 1.2.16 / build 30', () => {
  expect(app.expo.version).toBe('1.2.16');
  expect(app.expo.ios.buildNumber).toBe('30');
});
