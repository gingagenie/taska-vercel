import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Crown, Lock } from 'lucide-react'

interface SubscriptionErrorModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  action?: { label: string; url: string }
}

export function SubscriptionErrorModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  action 
}: SubscriptionErrorModalProps) {
  const isTrialExpired = title.includes('Trial Expired')
  
  const handleUpgrade = () => {
    if (action?.url) {
      window.location.href = action.url
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-100 to-purple-100">
            {isTrialExpired ? (
              <Lock className="h-6 w-6 text-red-600" />
            ) : (
              <Crown className="h-6 w-6 text-blue-600" />
            )}
          </div>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600 mt-2">
            {message}
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex gap-2 mt-6">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button 
            onClick={handleUpgrade}
            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {action?.label || 'Upgrade Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Global subscription error modal state management
let globalModalState = {
  isOpen: false,
  title: '',
  message: '',
  action: undefined as { label: string; url: string } | undefined,
  onClose: () => {}
}

let setGlobalModalState: ((state: typeof globalModalState) => void) | null = null

export function SubscriptionErrorModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState(globalModalState)
  
  useEffect(() => {
    setGlobalModalState = setModalState
    return () => {
      setGlobalModalState = null
    }
  }, [])

  const handleClose = () => {
    setModalState(prev => ({ ...prev, isOpen: false }))
  }

  return (
    <>
      {children}
      <SubscriptionErrorModal
        isOpen={modalState.isOpen}
        onClose={handleClose}
        title={modalState.title}
        message={modalState.message}
        action={modalState.action}
      />
    </>
  )
}

// Function to show the modal from anywhere in the app
export function showSubscriptionErrorModal(options: {
  title: string
  message: string
  action?: { label: string; url: string }
}) {
  if (setGlobalModalState) {
    setGlobalModalState({
      isOpen: true,
      title: options.title,
      message: options.message,
      action: options.action,
      onClose: () => {}
    })
  }
}