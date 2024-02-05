const express = require('express');
const app = express();
const axios = require('axios');
const bodyParser = require('body-parser');
const oauthConfig = require('./config');
const queryString = require('querystring');

const port = 3004;
//Would refactor the handling of storing the access token in a database
let token;

app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

//Zendesk API endpoint URLS
const zendeskTicketsUrl = `https://${oauthConfig.subDomain}.zendesk.com/api/v2/tickets.json`;

//Oauth2 flow setup for Zendesk API access
//Authorization code grant flow
app.get('/', (req, res) => {
    res.redirect(`${oauthConfig.authorizationUri}${queryString.stringify(
            {
                response_type: oauthConfig.response_type,
                redirectUri: oauthConfig.redirectUri,
                client_id: oauthConfig.clientId,
                scope: oauthConfig.scope
            }
        )}`
    )
})

//Once user has allowed the authorization decision
//redirect url will contain the authorization code needed to get an access token from Zendesk
app.get('/callback', async (req, res) => {
    const tokenResponse = await axios.post(
        oauthConfig.tokenUri,
        {
            grant_type: "authorization_code",
            code: req.query.code,
            client_id: oauthConfig.clientId,
            client_secret: oauthConfig.clientSecret,
            redirect_uri: oauthConfig.redirectUri,
            scope: oauthConfig.scope
        },
        {
            headers: {
                "Content-Type": 'application/json'
            }
        }
    )
    //access token is stored to token global variable
    const access_token = await tokenResponse.data.access_token;
    token = access_token;

    //User get user info Zendesk API call to insure Bearer Token is successful
    const loginUser = await axios.get(
        `https://${oauthConfig.subDomain}.zendesk.com/api/v2/users/me.json`,
        {
            headers: {Authorization: `Bearer ${access_token}`}
        })
    const htmlLoginPage = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Home</title>
        </head>
        <body>
            <p>Login Successful. Welcome ${loginUser.data.user.name}!</p>
        </body>
        </html>
    `;
    res.type('text/html').send(htmlLoginPage);
    //res.send(`Login Successful. Welcome ${users.data.user.name}!`)
});


//App endpoint route for getting all tickets in the current Zendesk Environment
app.get(`/tickets`, async (req, res) => {
    const response = await axios.get(
        zendeskTicketsUrl,
        {
            headers: {
                "Content-Type": 'application/json',
                Authorization: `Bearer ${token}`
            }
        });
    //Check if response code is 200
    //If 200, code will return a list of all object tickets in the current Zendesk Environment
    if (response.status === 200) {
        const tickets = response.data['tickets'].map(ticket => ({
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            url: ticket.url
        }));
        res.json({success: true, tickets})
    } else {
        res.json({success: false, message: "Failed to retrieve Zendesk Tickets."})
    }
});

//App endpoint route for creating a Zendesk Ticket
app.post('/create-ticket', async (req, res) => {
    const ticketData = {
        ticket: {
            subject: req.body.subject,
            priority: req.body.priority || 'normal',
            comment: {
                body: req.body.comment.body
            },
            requester: {
                name: req.body.requester.name,
                email: req.body.requester.email
            }
        }
    };
    //Post call with ticketData schema and headers
    //Try block in the event that the call is successful
    try {
        const response = await axios.post(
            zendeskTicketsUrl, ticketData, {
                headers: {
                    "Content-Type": 'application/json',
                    Authorization: `Bearer ${token}`
                }
            }
        );
        //Send Zendesk ticket to Slack Webhook url if priority status === 'urgent' or priority status === 'high'
        //Zendesk priority ticket values "urgent", "high", "normal", or "low"
        if (response.status === 201 && (response.data['ticket']['priority'] === 'urgent' || response.data['ticket']['priority'] === 'high')) {
            const slackWebHookMessage = {
                text: `New Urgent Zendesk Ticket: ${ticketData.ticket.subject}\nTicket Url: ${response.data['ticket']['url']}`,
                attachments: [
                    {
                        text: `Priority: ${ticketData.ticket.priority}\nRequester Name: ${ticketData.ticket.requester.name}\nRequester Email: ${ticketData.ticket.requester.email}`,
                        color: '#f31111'
                    }
                ]
            }
            //Post Slack message to Webhook url with Slack formatting of the ticket data to Slack
            //Send back response of Successful Zendesk ticket creation
            await axios.post(oauthConfig.slack_webhook_url, slackWebHookMessage);
        }
        res.status(201).json({success: true, message: 'Ticket creation successful', ticket: response.data.ticket});
        //Catch error block in the event that the API endpoint route failed
    } catch (error) {
        console.error('Failed creating Zendesk ticket:', error.data);
        res.status(error.response ? error.response.status : 500).json({error: 'Failed to create ticket'});

    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
})