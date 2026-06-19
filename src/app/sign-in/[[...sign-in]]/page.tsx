import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas nf-canvas-bg">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-node border border-border rounded-2xl",
          },
        }}
      />
    </div>
  );
}
