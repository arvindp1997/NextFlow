import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas nf-canvas-bg">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-card border border-border rounded-2xl",
          },
        }}
      />
    </div>
  );
}
