require('dotenv').config();
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appleId = process.env.appleId;
  const password = process.env.appleIdPassword;
  const notarizeApp = process.env.notarizeApp;

  if (!notarizeApp) {
    return;
  }

  return await notarize({
    appBundleId: 'mil.nga.mapcache',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: appleId,
    appleIdPassword: password,
  });
};
