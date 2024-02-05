require('dotenv').config()

module.exports = {
    subDomain: '1218globalhelp',
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    authorizationUri: 'https://1218globalhelp.zendesk.com/oauth/authorizations/new?',
    tokenUri: 'https://1218globalhelp.zendesk.com/oauth/tokens',
    redirectUri: 'http://localhost:3004/callback',
    scope: "users:read read users:write write",
    response_type: 'code',
    slack_webhook_url: process.env.slackWebHookUrl
};

