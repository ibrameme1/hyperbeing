import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Nova from './Nova';

// Nova docked in a corner of an app page with one short line to say.
// Used for first-run guidance (the first deck build, the empty dashboard).
// Purely presentational: the page decides what she says and when.
//
// children: the line (can include <b> and buttons)
// mood: Nova's expression
// id: change it to animate to a new line
// onDismiss: shows a close button; the page should remember the dismissal
// bottom: px offset from the bottom edge, to clear a page's own bottom bar
export default function NovaCoach({ id, children, mood = 'idle', onDismiss, side = 'left', light = false, bottom = 16 }) {
  return (
    <div
      className={`fixed z-40 flex items-end gap-2 pointer-events-none ${side === 'left' ? 'left-3 sm:left-5 flex-row' : 'right-3 sm:right-5 flex-row-reverse'}`}
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`, maxWidth: 'calc(100vw - 24px)' }}
    >
      <div className="pointer-events-auto shrink-0">
        <Nova size={72} mood={mood} />
      </div>
      <AnimatePresence mode="wait">
        {children && (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            aria-live="polite"
            className={`nova-say ${light ? 'nova-say--light' : ''} pointer-events-auto mb-8`}
            style={{ maxWidth: 300, paddingRight: onDismiss ? 34 : 14 }}
          >
            {children}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss Nova's tip"
                className="absolute top-2 right-2 w-6 h-6 grid place-items-center rounded-full opacity-60 hover:opacity-100"
              >
                <X size={13} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
