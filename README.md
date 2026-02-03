<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

WordPress Social Media Importer API - A NestJS-based API for importing Facebook posts and sending webhooks to WordPress sites.

This API provides:
- Authentication via Logto opaque tokens
- Facebook OAuth integration for connecting user accounts
- Automatic periodic fetching of Facebook posts
- Webhook delivery to user websites with authentication
- Secure storage of sensitive credentials with encryption

## Features

- **Authentication**: Validates opaque access tokens from Logto and extracts user/organization information
- **Facebook Integration**: Complete OAuth flow for connecting Facebook accounts and pages
- **Post Synchronization**: Automatically fetches new Facebook posts every 5 minutes (configurable)
- **Webhook Delivery**: Sends authenticated webhooks to user-configured endpoints when new posts are found
- **Secure Storage**: Encrypts Facebook access tokens and webhook auth keys using AES-256-GCM

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Logto instance (self-hosted or cloud)
- Facebook App with OAuth configured

## Installation

```bash
$ npm install
```

## Configuration

See [ENV_SETUP.md](./ENV_SETUP.md) for detailed environment variable configuration.

Create a `.env` file with the following required variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/facebook_importer
ENCRYPTION_KEY=<64-character-hex-key>
LOGTO_ENDPOINT=https://your-logto-instance.com
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=http://localhost:3000/facebook/callback
```

## API Endpoints

### Authentication
All endpoints (except `/facebook/callback`) require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer <opaque-access-token>
```

### Facebook Endpoints

- `GET /facebook/auth` - Initiate Facebook OAuth flow (redirects to Facebook)
- `GET /facebook/callback` - OAuth callback handler
- `GET /facebook/status` - Get connection status for organization
- `POST /facebook/disconnect` - Disconnect Facebook account

### Posts Endpoints

- `GET /posts` - List posts for organization (query params: `page`, `limit`)
- `GET /posts/:id` - Get single post by ID
- `DELETE /posts/:id` - Delete a post

### Webhooks Endpoints

- `POST /webhooks/config` - Create/update webhook configuration
  ```json
  {
    "webhookUrl": "https://your-site.com/webhook"
  }
  ```
- `GET /webhooks/config` - Get current webhook configuration
- `PUT /webhooks/config` - Update webhook configuration
- `DELETE /webhooks/config` - Delete webhook configuration
- `POST /webhooks/test` - Send a test webhook

### Webhook Payload Format

When a new post is detected, the API sends a POST request to the configured webhook URL:

```json
{
  "event": "new_post",
  "timestamp": "2026-02-03T12:00:00Z",
  "post": {
    "id": "uuid",
    "facebookPostId": "123456789",
    "content": "Post content...",
    "postType": "status",
    "metadata": {
      "permalinkUrl": "https://facebook.com/...",
      "link": "https://..."
    },
    "postedAt": "2026-02-03T10:00:00Z"
  },
  "signature": "hmac-sha256-signature"
}
```

The signature is generated using HMAC-SHA256 with the webhook auth key. Verify it on your end to ensure authenticity.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
