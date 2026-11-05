import { Router } from 'express'
import { getAdminClient } from '../lib/supabase.js'
import { asyncRoute, HttpError, optionalEmail, optionalString, requirePhone, requireString } from '../lib/http.js'
import { consume } from '../lib/rateLimit.js'

const router = Router()

router.post(
  '/inquiries',
  asyncRoute(async (req, res) => {
    const ip = req.ip ?? 'unknown'
    if (!consume(`inquiry:${ip}`, 5, 10 * 60_000)) {
      throw new HttpError(429, 'Too many inquiries from this device. Please try again later.')
    }

    const fullName = requireString(req.body?.fullName, 'Full name', { min: 2, max: 120 })
    const contactNumber = requirePhone(req.body?.contactNumber)
    const email = optionalEmail(req.body?.email)
    const address = optionalString(req.body?.address, 'Address', { max: 300 })
    const city = optionalString(req.body?.city, 'City', { max: 120 })
    const barangay = optionalString(req.body?.barangay, 'Barangay', { max: 120 })
    const message = optionalString(req.body?.message, 'Inquiry details', { max: 2000 })
    const branchId = optionalString(req.body?.branchId, 'Branch', { max: 60 })
    const planId = optionalString(req.body?.planId, 'Plan', { max: 60 })
    const type = req.body?.type === 'coverage_request' ? 'coverage_request' : 'public_inquiry'

    const admin = getAdminClient()

    if (branchId) {
      const { data: branch } = await admin
        .from('branches')
        .select('id, is_active')
        .eq('id', branchId)
        .maybeSingle()
      if (!branch || !branch.is_active) {
        throw new HttpError(400, 'Please choose a valid AON FIBER branch.')
      }
    }

    if (planId) {
      const { data: plan } = await admin
        .from('internet_plans')
        .select('id, is_active')
        .eq('id', planId)
        .maybeSingle()
      if (!plan || !plan.is_active) {
        throw new HttpError(400, 'Please choose an available internet plan.')
      }
    }

    const { data, error } = await admin
      .from('inquiries')
      .insert({
        full_name: fullName,
        contact_number: contactNumber,
        email,
        address,
        city,
        barangay,
        branch_id: branchId,
        plan_id: planId,
        message,
        type,
        status: 'new',
      })
      .select('reference_number')
      .single()

    if (error) {
      console.error('[inquiries] insert failed', error)
      throw new HttpError(500, 'We could not save your inquiry. Please try again.')
    }

    res.status(201).json({
      ok: true,
      referenceNumber: data.reference_number,
      message:
        type === 'coverage_request'
          ? 'Your installation request has been recorded. Our team will contact you once your area is ready.'
          : 'Your inquiry has been received. The branch you selected will contact you shortly.',
    })
  }),
)

export default router
