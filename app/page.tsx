import { JoinRoomForm } from "@/components/JoinRoomForm";

export default function Home() {
  return (
    <main className="landing-page">
      <section className="landing-shell" aria-labelledby="app-title">
        <div className="landing-copy">
          <p className="eyebrow">Reliable browser video calls</p>
          <h1 id="app-title">Summit Video</h1>
          <p>
            Join a private room with a simple link and start a focused two-person
            call.
          </p>
        </div>
        <JoinRoomForm />
      </section>
    </main>
  );
}
