//! Keep launcher windows independent of the game shortcut used to start them.
#[link(name = "shell32")]
extern "system" {
    fn SetCurrentProcessExplicitAppUserModelID(id: *const u16) -> i32;
}

pub fn set(id: &str) -> Result<(), i32> {
    let id: Vec<u16> = id.encode_utf16().chain(Some(0)).collect();
    let result = unsafe { SetCurrentProcessExplicitAppUserModelID(id.as_ptr()) };
    if result < 0 {
        Err(result)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn explicit_process_identity_roundtrips() {
        #[link(name = "shell32")]
        extern "system" {
            fn GetCurrentProcessExplicitAppUserModelID(id: *mut *mut u16) -> i32;
        }
        #[link(name = "ole32")]
        extern "system" {
            fn CoTaskMemFree(memory: *mut std::ffi::c_void);
        }
        let expected = "app.port.identity-test";
        super::set(expected).unwrap();
        unsafe {
            let mut id = std::ptr::null_mut();
            assert_eq!(GetCurrentProcessExplicitAppUserModelID(&mut id), 0);
            let mut len = 0;
            while *id.add(len) != 0 {
                len += 1;
            }
            let actual = String::from_utf16_lossy(std::slice::from_raw_parts(id, len));
            CoTaskMemFree(id.cast());
            assert_eq!(actual, expected);
        }
    }
}
