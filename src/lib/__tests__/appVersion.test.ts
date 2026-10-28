import app from '../../../app.json';

test('android.versionCode equals ios.buildNumber', () => {
  expect(app.expo.android.versionCode).toBe(Number(app.expo.ios.buildNumber));
});
test('version 1.2.14 / build 28', () => {
  expect(app.expo.version).toBe('1.2.14');
  expect(app.expo.ios.buildNumber).toBe('28');
});
