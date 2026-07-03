import { describe, expect, it } from 'vitest'
import { isLocalAppData, type LocalAppData } from './localDatabase'

const validData = (): LocalAppData => ({
  version: 1,
  products: [
    {
      id: 'product-1',
      name: '鴨頭',
      unit: '份',
      stock: '10.5',
      reorderLevel: '3',
      cost: '25.00',
      price: '50.00',
      createdAt: '2026-07-03T08:00:00.000Z',
      updatedAt: '2026-07-03T08:00:00.000Z',
    },
  ],
  movements: [
    {
      id: 'movement-1',
      type: 'sale',
      productId: 'product-1',
      productName: '鴨頭',
      unit: '份',
      quantity: '-1.5',
      unitPrice: '50.00',
      unitCost: '25.00',
      revenue: '75.00',
      costTotal: '37.50',
      note: '',
      createdAt: '2026-07-03T09:00:00.000Z',
    },
  ],
  lastBackupAt: null,
})

describe('isLocalAppData', () => {
  it('接受完整且版本正確的備份', () => {
    expect(isLocalAppData(validData())).toBe(true)
  })

  it('拒絕不支援的備份版本', () => {
    expect(isLocalAppData({ ...validData(), version: 2 })).toBe(false)
  })

  it('拒絕商品欄位不完整或數值無效的備份', () => {
    const data = validData()
    data.products[0] = { ...data.products[0], stock: 'not-a-number' }

    expect(isLocalAppData(data)).toBe(false)
  })

  it('拒絕異動紀錄欄位缺漏的備份', () => {
    const data = validData()
    const { createdAt: _createdAt, ...incompleteMovement } = data.movements[0]

    expect(isLocalAppData({ ...data, movements: [incompleteMovement] })).toBe(false)
  })
})
