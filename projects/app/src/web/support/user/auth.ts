import { loginOut } from '@/web/support/user/api';

export const clearToken = () => {
  try {
    localStorage.removeItem('fastgpt_token');
    return loginOut();
  } catch (error) {
    error;
  }
};
