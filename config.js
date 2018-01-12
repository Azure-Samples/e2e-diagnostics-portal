const credential = require('./_project_credential');
module.exports = {
    db: credential.db,
    fetchSpanInSeconds: 60,
    numberOfCapturedGroups: 8,
    cacheImageTimeoutInSeconds: 10,
    cacheImageProxy: credential.cacheImageProxy,
    apiPort: 3001,
    apiNameInUrl: 'api',
    assetPath: 'asset',
    wwwRoot: credential.wwwRoot,
    smtpConfig: {
        host: credential.smtp.host,
        secureConnection: true, // upgrade later with STARTTLS
        auth: {
            user: credential.smtp.user,
            pass: credential.smtp.pass,
        },
    },
    emailTo: credential.emailto,
    emailFrom: credential.emailfrom,
    web: {
        itemsPerPage: 10,
    }
}