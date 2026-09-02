import { EventList } from './event-list'
import { events } from './events'

export default function HomePage() {
  return (
    <div className="siteShell">
      <header className="siteHeader">
        <a className="brand" href="/" aria-label="藍住校のイベント・講座 トップへ">
          <span>つながるベストワン</span>
          <small>ECCベストワン</small>
        </a>
        <span className="schoolTag">藍住校</span>
      </header>

      <main className="pageMain">
        <section className="pageIntro" aria-labelledby="page-title">
          <p className="eyebrow">EVENTS &amp; COURSES</p>
          <h1 id="page-title">藍住校のイベント・講座</h1>
          <p className="lead">季節や学習時期に合わせた、藍住校からのご提案をご案内します。</p>
        </section>

        <EventList items={events} />

        <p className="pageNote">内容・日程の詳細は、各企画ページまたは案内PDFでご確認ください。</p>
      </main>

      <footer className="siteFooter">
        <span>ECCベストワン 藍住校</span>
      </footer>
    </div>
  )
}
