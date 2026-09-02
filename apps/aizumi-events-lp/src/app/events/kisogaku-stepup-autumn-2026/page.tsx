import type { Metadata } from 'next'
import Link from 'next/link'
import { NewBadge } from '../../new-badge'

export const metadata: Metadata = {
  title: '中3 基礎学ステップアップ講座',
  description: 'ECCベストワン藍住校の中学3年生対象「基礎学ステップアップ講座」の趣旨とご案内です。',
}

const principles = [
  {
    number: '01',
    title: '現在の理解を整理する',
    body: 'できているところと、もう一度確認したいところを分け、学習の出発点を明確にします。',
  },
  {
    number: '02',
    title: '優先順位を決める',
    body: 'すべてを一度に進めるのではなく、今の学習に必要な内容から順に取り組みます。',
  },
  {
    number: '03',
    title: '解き直しを次につなげる',
    body: '問題を解いて終わりにせず、間違えた理由を確認し、次の学習につなげます。',
  },
]

export default function KisogakuStepupPage() {
  return (
    <div className="siteShell detailShell">
      <header className="siteHeader">
        <Link className="brand" href="/" aria-label="藍住校のイベント・講座一覧へ">
          <span>つながるベストワン</span>
          <small>ECCベストワン</small>
        </Link>
        <span className="schoolTag">藍住校</span>
      </header>

      <main>
        <section className="detailHero">
          <div className="detailHeroInner">
            <div className="detailBadges">
              <NewBadge publishedAt="2026-09-02" newUntil="2026-09-08" />
              <span className="audience audienceStrong">中学3年生対象</span>
            </div>
            <p className="eyebrow">KISOGAKU STEP UP</p>
            <h1>基礎学ステップアップ講座</h1>
            <p className="detailLead">
              基礎学力テストに向けて、これまでの学習を整理し、次に取り組むことを明確にする講座です。
              「何を、どの順番で学ぶか」を整え、日々の学習につなげます。
            </p>
            <dl className="detailFacts">
              <div>
                <dt>対象</dt>
                <dd>中学3年生</dd>
              </div>
              <div>
                <dt>ご案内期間</dt>
                <dd>2026年9月7日〜10月31日</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="detailSection" aria-labelledby="purpose-heading">
          <div className="sectionHeading">
            <p className="eyebrow">PURPOSE</p>
            <h2 id="purpose-heading">「わかる」を、次に解ける力へ</h2>
            <p>
              基礎学力テストに向けた学習では、問題数を増やすだけでなく、理解が不十分な箇所を見つけ、
              学び直す順番を整えることが大切です。この講座では、一人ひとりの学習を次の行動につなげることを重視します。
            </p>
          </div>

          <div className="principleGrid">
            {principles.map((principle) => (
              <article className="principleCard" key={principle.number}>
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="detailSection detailSectionSoft" aria-labelledby="students-heading">
          <div className="sectionHeading compactHeading">
            <p className="eyebrow">FOR STUDENTS</p>
            <h2 id="students-heading">このような中学3年生へ</h2>
          </div>
          <ul className="studentList">
            <li>どこから復習すればよいか整理したい</li>
            <li>基礎学力テストに向けて、計画的に学習を進めたい</li>
            <li>間違えた問題の解き直しを、次の得点につなげたい</li>
          </ul>
        </section>

        <section className="contactSection" aria-labelledby="contact-heading">
          <p className="eyebrow">INFORMATION</p>
          <h2 id="contact-heading">詳しい内容は教室からご案内します</h2>
          <p>実施日時、学習内容、お申し込み方法については、ECCベストワン藍住校までお問い合わせください。</p>
          <div className="contactActions">
            <a className="primaryButton" href="https://lin.ee/vujhumEo" target="_blank" rel="noreferrer">
              公式LINEで相談する
              <span aria-hidden="true">→</span>
            </a>
            <Link className="textLink" href="/">
              イベント・講座一覧へ戻る
            </Link>
          </div>
        </section>
      </main>

      <footer className="siteFooter">
        <span>ECCベストワン 藍住校</span>
      </footer>
    </div>
  )
}
