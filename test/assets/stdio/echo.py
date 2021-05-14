#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals


import sys

if sys.version_info[0] < 3:
    input = raw_input


def main():
    print(input())


if __name__ == '__main__':
    main()

