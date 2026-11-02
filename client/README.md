# HackX client

See the [root setup guide](../README.md) for the complete app, local Hardhat stack and Sepolia deployment. Running only this Next client does not start the API, scorer or contract.

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` for Sepolia and configure the same version 2 contract address as the server. The local stack sets these values automatically. Keep all private keys server-side. The UI retains the original stage and character assets.

Routes: `/`, `/auth`, `/arena`, `/score?entryId=…`, `/leaderboard`, `/graph`, `/admin`. Old `/index.html` links redirect to Arena. Results come from verified chain entries and server jobs, never browser-provided scoring data.
