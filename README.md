# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/dde9e4a0-2a35-4ba6-8013-1e36c16cda69

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/dde9e4a0-2a35-4ba6-8013-1e36c16cda69) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Local edge-function development (without Lovable sync)

Use this when you want local UI + local `get-train-departures` behavior immediately.

1. Start Supabase function runtime locally (separate terminal):

```sh
supabase functions serve get-train-departures --no-verify-jwt
```

2. In your local `.env`, add:

```sh
VITE_USE_LOCAL_FUNCTIONS="true"
VITE_LOCAL_FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1"
```

3. Restart Vite:

```sh
npm run dev
```

When enabled, the app calls:
`http://127.0.0.1:54321/functions/v1/get-train-departures`

Set `VITE_USE_LOCAL_FUNCTIONS="false"` (or remove both vars) to go back to cloud backend.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/dde9e4a0-2a35-4ba6-8013-1e36c16cda69) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
