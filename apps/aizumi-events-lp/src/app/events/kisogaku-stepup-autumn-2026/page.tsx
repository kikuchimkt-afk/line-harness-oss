import type { Metadata } from 'next'
import Link from 'next/link'
import { NewBadge } from '../../new-badge'

export const metadata: Metadata = {
  title: '中3 基礎学ステップアップ講座',
  description:
    'ECCベストワン藍住校の中学3年生対象「基礎学ステップアップ講座」。学習アプリも活用し、今必要な課題に集中して取り組みます。',
}

const principles = [
  {
    number: '01',
    title: '現在の理解を整理する',
    body: 'できているところと、もう一度確認したいところを分け、学習の出発点を明確にします。',
  },
  {
    number: '02',
    title: '今必要な問題を選ぶ',
    body: '講師が過去問や学習アプリを活用し、理解度と残り時間に合わせて取り組む内容と量を調整します。',
  },
  {
    number: '03',
    title: '解き直しを次につなげる',
    body: '解説で間違えた理由を確認し、もう一度解ける状態にしてから、次の課題へ進みます。',
  },
]

const learningCycle = [
  {
    number: '01',
    title: '診断する',
    body: '答案や学習状況から、優先して補いたい単元を見つけます。',
  },
  {
    number: '02',
    title: '選ぶ',
    body: '講師がアプリを使い、今の理解度に合う問題を絞り込みます。',
  },
  {
    number: '03',
    title: '集中して解く',
    body: '無理のない量に区切り、必要な問題へ短時間で集中します。',
  },
  {
    number: '04',
    title: '解説・解き直し',
    body: '考え方を確かめて解き直し、その結果を次の課題選びに生かします。',
  },
]

const studyApps = [
  {
    number: '01',
    category: '徳島県の基礎学対策',
    title: '基礎学過去問解説アプリ',
    product: '基礎学最前線',
    body: '徳島県の基礎学力テストの過去問を、数学・英語・理科・社会の4教科から確認できます。詳しい解説を使い、基礎学で問われる内容を一つずつ学び直します。',
    use: '現在地の確認と、基礎学に直結する課題選びに活用します。',
    tags: ['数学', '英語', '理科', '社会'],
    href: 'https://frontiers-of-kisogaku.vercel.app/',
  },
  {
    number: '02',
    category: '類題で理解を確かめる',
    title: '全国高校入試過去問解説アプリ',
    product: '高校入試アーカイブ',
    body: '全国の高校入試問題を、都道府県・年度・教科などから探せます。解説付き問題を使い、基礎学で見つかった弱点を別の出題でも解けるか確かめます。',
    use: '同じ単元の類題演習と、知識を使う練習に活用します。',
    tags: ['全国の入試問題', '類題演習', '解説付き'],
    href: 'https://velora-studio-rust.vercel.app/',
  },
  {
    number: '03',
    category: '理科を単元別に補強',
    title: '理科特化アプリ SCIENTIA',
    product: '高校入試 理科単元別アーカイブ',
    body: '中1・中2範囲の理科を、物理・化学・地学・生物の分野や単元から絞り込めます。問題・正解・解説まで続けて確認し、苦手な範囲を集中的に復習します。',
    use: '理科の苦手単元を特定し、必要な大問だけを選ぶために活用します。',
    tags: ['中1・中2範囲', '理科4分野', '単元別'],
    href: 'https://lattice-studio-amber.vercel.app/',
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
              基礎学力テストに向けて、講師の学習設計と3つの学習アプリを組み合わせ、今必要な課題に集中する講座です。
              適切な課題を、適切な量で。解説と解き直しまでの流れを短くし、限られた期間の学習を次に解ける力へつなげます。
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
            <h2 id="purpose-heading">
              「わかる」を、次に<span className="keepTogether">解ける力へ</span>
            </h2>
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

        <section className="detailSection appLearningSection" aria-labelledby="apps-heading">
          <div className="sectionHeading appSectionHeading">
            <p className="eyebrow">APP-ASSISTED LEARNING</p>
            <h2 id="apps-heading">問題を増やすのではなく、今必要な問題に絞る</h2>
            <p>
              アプリを使う目的は、たくさんの問題を解かせることではありません。講師が現在の理解と次のテストまでの期間を確認し、
              3つのアプリから今取り組む課題を選びます。解く・確かめる・解き直すサイクルを短く回し、必要な内容の習得を目指します。
            </p>
          </div>

          <div className="learningFormula" aria-label="学習設計の考え方">
            <strong>適切な課題</strong>
            <span aria-hidden="true">×</span>
            <strong>適切な量</strong>
            <span aria-hidden="true">×</span>
            <strong>短い学習サイクル</strong>
          </div>

          <ol className="learningCycle">
            {learningCycle.map((step) => (
              <li className="cycleCard" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="studyAppGrid">
            {studyApps.map((app) => (
              <article className="studyAppCard" key={app.number}>
                <div className="appCardMeta">
                  <span>{app.number}</span>
                  <small>{app.category}</small>
                </div>
                <h3>{app.title}</h3>
                <p className="appProduct">{app.product}</p>
                <p className="appDescription">{app.body}</p>
                <p className="appUse"><strong>講座での活用</strong>{app.use}</p>
                <ul className="appTags" aria-label={`${app.title}の特徴`}>
                  {app.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <a className="appLink" href={app.href} target="_blank" rel="noreferrer">
                  アプリの内容を見る
                  <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>

          <p className="appSupportNote">
            アプリは講師の代わりではなく、課題選定と反復を速くする道具として使います。学習状況に応じて、使用するアプリ・教科・問題数を調整します。
          </p>
        </section>

        <section className="detailSection detailSectionSoft" aria-labelledby="students-heading">
          <div className="sectionHeading compactHeading">
            <p className="eyebrow">FOR STUDENTS</p>
            <h2 id="students-heading">このような中学3年生へ</h2>
          </div>
          <ul className="studentList">
            <li>どこから復習すればよいか整理したい</li>
            <li>過去問を解きっぱなしにせず、解説と解き直しまで取り組みたい</li>
            <li>限られた時間で、必要な単元に絞って学習したい</li>
          </ul>
        </section>

        <section className="contactSection" aria-labelledby="contact-heading">
          <p className="eyebrow">INFORMATION</p>
          <h2 id="contact-heading">詳しい内容は教室からご案内します</h2>
          <p>実施日時、学習内容、お申し込み方法については、ECCベストワン藍住校までお問い合わせください。</p>
          <div className="contactActions">
            <a
              className="primaryButton"
              href="https://liff.line.me/2011200807-IztOr7TD?page=form&id=6dbebd34-3490-4323-b0de-86159dfd91c9&liffId=2011200807-IztOr7TD"
              target="_blank"
              rel="noreferrer"
            >
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
