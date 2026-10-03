//! A Windows job object that kills every child when the app exits.
//!
//! # Why this exists
//!
//! The app spawns proxy cores as detached child processes. A detached child
//! outlives its parent unless something ties its lifetime to the parent's, and
//! the parent's `Drop` is not a guarantee: a GUI framework that exits without
//! dropping its managed state leaves every child running. A job object with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is that tie — when the app's process
//! exits, gracefully or not, Windows closes the job and terminates every
//! process still in it, so no core is orphaned.
//!
//! The job is created once, before any core is spawned, so every core inherits
//! it. It is best effort: a process already inside another job cannot be
//! assigned on some Windows versions, and a build that cannot create one
//! should still run.

/// The job object this process belongs to, if one was created.
pub struct JobObject {
    handle: *mut std::ffi::c_void,
}

impl JobObject {
    /// Puts the current process — and thus every child it spawns — into a job
    /// that kills them when the process exits.
    pub fn assign_current_process() -> Self {
        #[cfg(windows)]
        {
            use std::ffi::c_void;
            type Handle = *mut c_void;
            const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
            // The job exists to reap proxy cores, not to own the browsers.
            // Allowing breakaway — and having the browser spawn ask for it —
            // keeps a detached browser alive after this process goes away,
            // which is the whole point of launching it detached.
            const JOB_OBJECT_LIMIT_BREAKAWAY_OK: u32 = 0x0400;
            const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;

            #[repr(C)]
            struct BasicLimitInformation {
                per_process_user_time_limit: i64,
                per_job_user_time_limit: i64,
                limit_flags: u32,
                minimum_working_set_size: usize,
                maximum_working_set_size: usize,
                active_process_limit: u32,
                affinity: usize,
                priority_class: u32,
                scheduling_class: u32,
            }

            #[repr(C)]
            struct IoCounters {
                read_operation_count: u64,
                write_operation_count: u64,
                other_operation_count: u64,
                read_transfer_count: u64,
                write_transfer_count: u64,
                other_transfer_count: u64,
            }

            #[repr(C)]
            struct ExtendedLimitInformation {
                basic_limit_information: BasicLimitInformation,
                io_info: IoCounters,
                process_memory_limit: usize,
                job_memory_limit: usize,
                peak_process_memory_used: usize,
                peak_job_memory_used: usize,
            }

            extern "system" {
                fn CreateJobObjectW(lpjobattributes: *mut c_void, lpname: *const u16) -> Handle;
                fn SetInformationJobObject(
                    hjob: Handle,
                    class: i32,
                    info: *mut ExtendedLimitInformation,
                    len: u32,
                ) -> i32;
                fn AssignProcessToJobObject(hjob: Handle, hprocess: Handle) -> i32;
                fn GetCurrentProcess() -> Handle;
            }

            unsafe {
                let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
                if !handle.is_null() {
                    let mut info = ExtendedLimitInformation {
                        basic_limit_information: BasicLimitInformation {
                            per_process_user_time_limit: 0,
                            per_job_user_time_limit: 0,
                            limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                                | JOB_OBJECT_LIMIT_BREAKAWAY_OK,
                            minimum_working_set_size: 0,
                            maximum_working_set_size: 0,
                            active_process_limit: 0,
                            affinity: 0,
                            priority_class: 0,
                            scheduling_class: 0,
                        },
                        io_info: IoCounters {
                            read_operation_count: 0,
                            write_operation_count: 0,
                            other_operation_count: 0,
                            read_transfer_count: 0,
                            write_transfer_count: 0,
                            other_transfer_count: 0,
                        },
                        process_memory_limit: 0,
                        job_memory_limit: 0,
                        peak_process_memory_used: 0,
                        peak_job_memory_used: 0,
                    };
                    SetInformationJobObject(
                        handle,
                        JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                        &mut info,
                        std::mem::size_of::<ExtendedLimitInformation>() as u32,
                    );
                    // A process already in a job cannot be joined to another; the
                    // assignment is best effort and a failure is not fatal.
                    AssignProcessToJobObject(handle, GetCurrentProcess());
                }
                Self { handle }
            }
        }
        #[cfg(not(windows))]
        {
            Self {
                handle: std::ptr::null_mut(),
            }
        }
    }

    /// Whether a job was created and joined.
    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        !self.handle.is_null()
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        #[cfg(windows)]
        {
            extern "system" {
                fn CloseHandle(h: *mut std::ffi::c_void) -> i32;
            }
            unsafe {
                if !self.handle.is_null() {
                    CloseHandle(self.handle);
                }
            }
        }
        self.handle = std::ptr::null_mut();
    }
}
