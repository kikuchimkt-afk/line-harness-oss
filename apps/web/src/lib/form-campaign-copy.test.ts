import { describe, expect, it } from 'vitest'
import { buildAccountFormLinks, copyFieldsToCampaignDraft } from './form-campaign-copy'

describe('copyFieldsToCampaignDraft', () => {
  it('copies question content and assigns new draft ids', () => {
    let id = 0
    const copied = copyFieldsToCampaignDraft([
      {
        name: 'grade',
        label: '学年',
        type: 'radio',
        required: true,
        placeholder: '選択してください',
        options: ['中学1年生', '中学2年生'],
      },
    ], () => `draft-${++id}`)

    expect(copied).toEqual([
      {
        id: 'draft-1',
        label: '学年',
        type: 'radio',
        required: true,
        placeholder: '選択してください',
        optionsText: '中学1年生\n中学2年生',
      },
    ])
  })
})

describe('buildAccountFormLinks', () => {
  it('pins both the friend-add flow and direct form to the selected account', () => {
    const links = buildAccountFormLinks({
      workerBase: 'https://worker.example.com/',
      account: { channelId: '2000000000', liffId: '2000000000-AbCdEf' },
      formId: 'form id',
      refCode: 'eiken-2026',
    })

    expect(links.campaignUrl).toBe(
      'https://worker.example.com/auth/line?ref=eiken-2026&form=form+id&account=2000000000',
    )
    expect(links.directFormUrl).toBe(
      'https://liff.line.me/2000000000-AbCdEf?page=form&id=form+id&liffId=2000000000-AbCdEf',
    )
  })

  it('rebuilds links for an existing form without requiring an entry-route code', () => {
    const links = buildAccountFormLinks({
      workerBase: 'https://worker.example.com',
      account: { channelId: '2000000000', liffId: '2000000000-AbCdEf' },
      formId: 'existing-form',
    })

    expect(links.campaignUrl).toBe(
      'https://worker.example.com/auth/line?form=existing-form&account=2000000000',
    )
    expect(links.directFormUrl).toBe(
      'https://liff.line.me/2000000000-AbCdEf?page=form&id=existing-form&liffId=2000000000-AbCdEf',
    )
  })
})
