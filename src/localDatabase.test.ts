import { describe, expect, it } from 'vitest'
import { isLocalAppData, type LocalAppData } from './localDatabase'

const validData = (): LocalAppData => ({
  version: 1,
  products: [
    {
      id: 'product-1',
      name: '鮮奶茶',
      unit: '杯',
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
      productName: '鮮奶茶',
      unit: '杯',
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
  it('accepts a valid saved payload', () => {
    expect(isLocalAppData(validData())).toBe(true)
  })

  it('rejects an unsupported version', () => {
    expect(isLocalAppData({ ...validData(), version: 2 })).toBe(false)
  })

  it('rejects invalid decimal strings', () => {
    const data = validData()
    data.products[0] = { ...data.products[0], stock: 'not-a-number' }

    expect(isLocalAppData(data)).toBe(false)
  })

  it('rejects movements with missing required fields', () => {
    const data = validData()
    const { createdAt: _createdAt, ...incompleteMovement } = data.movements[0]

    expect(isLocalAppData({ ...data, movements: [incompleteMovement] })).toBe(false)
  })

  it('accepts grouped sale lines with an order id', () => {
    const data = validData()
    data.movements[0] = { ...data.movements[0], orderId: 'order-1' }

    expect(isLocalAppData(data)).toBe(true)
  })
})
